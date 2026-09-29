//! Windows-only, private native boundary. The arena owns one whole page;
//! SQLCipher and Argon2 allocate separately and are not claimed page locked.
use crate::{Error, Result};
use std::{
    ffi::c_void,
    ptr::NonNull,
    sync::atomic::{compiler_fence, Ordering},
};
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::Cryptography::{
        BCryptGenRandom, CryptProtectData, CryptUnprotectData, BCRYPT_USE_SYSTEM_PREFERRED_RNG,
        CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    },
    System::{
        Memory::{
            VirtualAlloc, VirtualFree, VirtualLock, VirtualProtect, VirtualUnlock, MEM_COMMIT,
            MEM_RELEASE, MEM_RESERVE, PAGE_READONLY, PAGE_READWRITE,
        },
        SystemInformation::{GetSystemInfo, SYSTEM_INFO},
    },
};
use zeroize::Zeroizing;

/// Each fault is a test-only pre-call failure. Real OS failures remain separate.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Fault {
    #[default]
    None,
    Rng,
    Alloc,
    Lock,
    Protect,
    Clear,
    Unlock,
    Free,
}

pub fn fill_random(out: &mut [u8], fault: Fault) -> Result<()> {
    if fault == Fault::Rng {
        return Err(Error("injected-rng"));
    }
    let count = u32::try_from(out.len()).map_err(|_| Error("rng-size"))?;
    let rc = unsafe {
        BCryptGenRandom(
            std::ptr::null_mut(),
            out.as_mut_ptr(),
            count,
            BCRYPT_USE_SYSTEM_PREFERRED_RNG,
        )
    };
    if rc < 0 {
        return Err(Error("windows-rng"));
    }
    Ok(())
}

pub fn random<const N: usize>() -> Result<[u8; N]> {
    let mut bytes = [0; N];
    fill_random(&mut bytes, Fault::None)?;
    Ok(bytes)
}

fn wipe(ptr: *mut u8, len: usize) {
    for i in 0..len {
        unsafe {
            std::ptr::write_volatile(ptr.add(i), 0);
        }
    }
    compiler_fence(Ordering::SeqCst);
}

pub struct Arena {
    ptr: NonNull<u8>,
    size: usize,
    used: usize,
    locked: bool,
    readonly: bool,
    released: bool,
}

impl Arena {
    pub fn new(secret: &[u8], fault: Fault) -> Result<Self> {
        if secret.is_empty() {
            return Err(Error("empty-arena"));
        }
        let mut info = std::mem::MaybeUninit::<SYSTEM_INFO>::zeroed();
        unsafe {
            GetSystemInfo(info.as_mut_ptr());
        }
        let info = unsafe { info.assume_init() };
        let size = info.dwPageSize as usize;
        if !(1024..=65536).contains(&size) || secret.len() > size {
            return Err(Error("arena-page-bound"));
        }
        if fault == Fault::Alloc {
            return Err(Error("injected-arena-alloc"));
        }
        let raw = unsafe {
            VirtualAlloc(
                std::ptr::null(),
                size,
                MEM_COMMIT | MEM_RESERVE,
                PAGE_READWRITE,
            )
        };
        let ptr = NonNull::new(raw.cast::<u8>()).ok_or(Error("arena-alloc"))?;
        let mut arena = Self {
            ptr,
            size,
            used: secret.len(),
            locked: false,
            readonly: false,
            released: false,
        };
        if fault == Fault::Lock {
            let _ = arena.clear(Fault::None);
            return Err(Error("injected-arena-lock"));
        }
        if unsafe { VirtualLock(ptr.as_ptr().cast(), size) } == 0 {
            let _ = arena.clear(Fault::None);
            return Err(Error("arena-lock"));
        }
        arena.locked = true;
        if fault == Fault::Protect {
            let _ = arena.clear(Fault::None);
            return Err(Error("injected-arena-protect"));
        }
        unsafe {
            std::ptr::copy_nonoverlapping(secret.as_ptr(), ptr.as_ptr(), secret.len());
        }
        arena.protect(PAGE_READONLY)?;
        Ok(arena)
    }

    fn protect(&mut self, new: u32) -> Result<()> {
        let mut prior = 0u32;
        if unsafe { VirtualProtect(self.ptr.as_ptr().cast(), self.size, new, &mut prior) } == 0 {
            return Err(Error("arena-protect"));
        }
        self.readonly = new == PAGE_READONLY;
        Ok(())
    }

    pub fn read_at<const N: usize>(&self, offset: usize) -> Result<Zeroizing<[u8; N]>> {
        if self.released || !self.locked || offset.checked_add(N).is_none_or(|end| end > self.used)
        {
            return Err(Error("arena-range"));
        }
        let mut out = Zeroizing::new([0; N]);
        unsafe {
            std::ptr::copy_nonoverlapping(self.ptr.as_ptr().add(offset), out.as_mut_ptr(), N);
        }
        Ok(out)
    }

    /// Retains ownership after a recoverable cleanup failure so the caller can
    /// enter LockFailed and retry cleanup. `Drop` is only last-resort cleanup.
    pub fn clear(&mut self, fault: Fault) -> Result<()> {
        if self.released {
            return Ok(());
        }
        if fault == Fault::Clear {
            return Err(Error("injected-arena-clear"));
        }
        if self.readonly {
            self.protect(PAGE_READWRITE)?;
        }
        wipe(self.ptr.as_ptr(), self.size);
        if self.locked {
            if fault == Fault::Unlock {
                return Err(Error("injected-arena-unlock"));
            }
            if unsafe { VirtualUnlock(self.ptr.as_ptr().cast(), self.size) } == 0 {
                return Err(Error("arena-unlock"));
            }
            self.locked = false;
        }
        if fault == Fault::Free {
            return Err(Error("injected-arena-free"));
        }
        if unsafe { VirtualFree(self.ptr.as_ptr().cast(), 0, MEM_RELEASE) } == 0 {
            return Err(Error("arena-free"));
        }
        self.released = true;
        Ok(())
    }
}
impl Drop for Arena {
    fn drop(&mut self) {
        let _ = self.clear(Fault::None);
    }
}

fn entropy(workspace: &[u8; 16], install: &[u8; 16]) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(b"GLYMIZE-DPAPI-1\0");
    h.update(workspace);
    h.update(install);
    h.finalize().into()
}

struct Output(CRYPT_INTEGER_BLOB);
impl Output {
    fn bytes(&self, max: usize) -> Result<&[u8]> {
        let len = self.0.cbData as usize;
        if len == 0 || len > max || self.0.pbData.is_null() {
            return Err(Error("dpapi-output-bound"));
        }
        Ok(unsafe { std::slice::from_raw_parts(self.0.pbData, len) })
    }
    fn release(&mut self) -> Result<()> {
        if self.0.pbData.is_null() {
            return Ok(());
        }
        wipe(self.0.pbData, self.0.cbData as usize);
        if !unsafe { LocalFree(self.0.pbData.cast::<c_void>()) }.is_null() {
            return Err(Error("dpapi-output-free"));
        }
        self.0.pbData = std::ptr::null_mut();
        self.0.cbData = 0;
        Ok(())
    }
}
impl Drop for Output {
    fn drop(&mut self) {
        let _ = self.release();
    }
}
fn blob(value: &[u8]) -> Result<CRYPT_INTEGER_BLOB> {
    Ok(CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(value.len()).map_err(|_| Error("dpapi-size"))?,
        pbData: value.as_ptr().cast_mut(),
    })
}
pub fn dpapi_protect(
    workspace: &[u8; 16],
    install: &[u8; 16],
    device: &[u8; 32],
) -> Result<Vec<u8>> {
    let mut body = [0u8; 72];
    body[..8].copy_from_slice(b"GLYDP001");
    body[8..24].copy_from_slice(workspace);
    body[24..40].copy_from_slice(install);
    body[40..].copy_from_slice(device);
    let binding = entropy(workspace, install);
    let src = blob(&body)?;
    let aux = blob(&binding)?;
    let mut out = Output(CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    });
    let ok = unsafe {
        CryptProtectData(
            &src,
            std::ptr::null(),
            &aux,
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out.0,
        )
    };
    wipe(body.as_mut_ptr(), body.len());
    if ok == 0 {
        return Err(Error("dpapi-protect"));
    }
    let protected = out.bytes(16384)?.to_vec();
    out.release()?;
    Ok(protected)
}
pub fn dpapi_unprotect(
    workspace: &[u8; 16],
    install: &[u8; 16],
    wrapped: &[u8],
) -> Result<Zeroizing<[u8; 32]>> {
    if wrapped.is_empty() || wrapped.len() > 16384 {
        return Err(Error("dpapi-blob-bound"));
    }
    let binding = entropy(workspace, install);
    let src = blob(wrapped)?;
    let aux = blob(&binding)?;
    let mut out = Output(CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    });
    let ok = unsafe {
        CryptUnprotectData(
            &src,
            std::ptr::null_mut(),
            &aux,
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out.0,
        )
    };
    if ok == 0 {
        return Err(Error("dpapi-unprotect"));
    }
    let plaintext = out.bytes(72)?;
    if plaintext.len() != 72
        || &plaintext[..8] != b"GLYDP001"
        || &plaintext[8..24] != workspace
        || &plaintext[24..40] != install
    {
        return Err(Error("dpapi-context"));
    }
    let mut device = Zeroizing::new([0u8; 32]);
    device.copy_from_slice(&plaintext[40..]);
    out.release()?;
    Ok(device)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn arena_real_and_injected_failures() {
        let key = [0x5a; 32];
        for fault in [Fault::Alloc, Fault::Lock, Fault::Protect] {
            assert!(Arena::new(&key, fault).is_err());
        }
        let mut a = Arena::new(&key, Fault::None)
            .expect("small page must lock on supported non-elevated Windows tier");
        assert_eq!(&*a.read_at::<32>(0).unwrap(), &key);
        for fault in [Fault::Clear, Fault::Unlock, Fault::Free] {
            assert!(a.clear(fault).is_err());
            assert!(a.clear(Fault::None).is_ok());
            if fault != Fault::Free {
                a = Arena::new(&key, Fault::None).unwrap();
            }
        }
        assert!(a.read_at::<1>(0).is_err());
    }
    #[test]
    fn rng_dpapi_context() {
        let mut b = [0u8; 32];
        assert_eq!(fill_random(&mut b, Fault::Rng), Err(Error("injected-rng")));
        fill_random(&mut b, Fault::None).unwrap();
        assert_ne!(b, [0; 32]);
        let w = [1; 16];
        let i = [2; 16];
        let blob = dpapi_protect(&w, &i, &b).unwrap();
        assert_eq!(&*dpapi_unprotect(&w, &i, &blob).unwrap(), &b);
        assert!(dpapi_unprotect(&w, &[3; 16], &blob).is_err());
    }
}
