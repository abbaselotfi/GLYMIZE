//! Synthetic coordinator proving close-before-clear ordering. It is not a
//! production connection pool, and no unregistered handle may escape it.
use crate::{
    platform::{Arena, Fault},
    Error, Result,
};
use rusqlite::Connection;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum State {
    Locked,
    Unlocking,
    Unlocked,
    Locking,
    LockFailed,
}

pub struct Custody {
    state: State,
    // Field order also drops native connections before the secret page.
    connections: Vec<Connection>,
    arena: Option<Arena>,
}
impl Default for Custody {
    fn default() -> Self {
        Self {
            state: State::Locked,
            connections: Vec::new(),
            arena: None,
        }
    }
}
impl Custody {
    pub fn state(&self) -> State {
        self.state
    }
    pub fn unlock(&mut self, secret: &[u8], fault: Fault) -> Result<()> {
        if self.state != State::Locked || self.arena.is_some() || !self.connections.is_empty() {
            return Err(Error("custody-not-locked"));
        }
        self.state = State::Unlocking;
        match Arena::new(secret, fault) {
            Ok(arena) => {
                self.arena = Some(arena);
                self.state = State::Unlocked;
                Ok(())
            }
            Err(error) => {
                self.state = State::Locked;
                Err(error)
            }
        }
    }
    pub fn register(
        &mut self,
        connection: Connection,
    ) -> std::result::Result<(), (Error, Connection)> {
        if self.state != State::Unlocked {
            return Err((Error("custody-not-unlocked"), connection));
        }
        self.connections.push(connection);
        Ok(())
    }
    pub fn lock(&mut self, clear_fault: Fault) -> Result<()> {
        if self.state != State::Unlocked && self.state != State::LockFailed {
            return Err(Error("custody-not-unlocked"));
        }
        self.state = State::Locking;
        while let Some(connection) = self.connections.pop() {
            if let Err((connection, _error)) = connection.close() {
                self.connections.push(connection);
                self.state = State::LockFailed;
                return Err(Error("custody-close-busy"));
            }
        }
        let arena = self.arena.as_mut().ok_or(Error("custody-arena-missing"))?;
        if let Err(error) = arena.clear(clear_fault) {
            self.state = State::LockFailed;
            return Err(error);
        }
        self.arena = None;
        self.state = State::Locked;
        Ok(())
    }
    #[cfg(test)]
    pub fn read_key_for_test(&self) -> Result<zeroize::Zeroizing<[u8; 32]>> {
        if self.state != State::Unlocked && self.state != State::LockFailed {
            return Err(Error("custody-key-inaccessible"));
        }
        self.arena
            .as_ref()
            .ok_or(Error("custody-arena-missing"))?
            .read_at::<32>(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn close_failure_retains_custody() {
        let mut custody = Custody::default();
        assert!(custody
            .register(Connection::open_in_memory().unwrap())
            .is_err());
        assert!(custody.unlock(&[7; 32], Fault::Alloc).is_err());
        assert_eq!(custody.state(), State::Locked);
        custody.unlock(&[7; 32], Fault::None).unwrap();
        let connection = Connection::open_in_memory().unwrap();
        let mut raw = std::ptr::null_mut();
        assert_eq!(
            unsafe {
                rusqlite::ffi::sqlite3_prepare_v2(
                    connection.handle(),
                    c"SELECT 1".as_ptr(),
                    -1,
                    &mut raw,
                    std::ptr::null_mut(),
                )
            },
            rusqlite::ffi::SQLITE_OK
        );
        custody.register(connection).unwrap();
        assert_eq!(custody.lock(Fault::None), Err(Error("custody-close-busy")));
        assert_eq!(custody.state(), State::LockFailed);
        assert_eq!(&*custody.read_key_for_test().unwrap(), &[7; 32]);
        assert!(custody.unlock(&[8; 32], Fault::None).is_err());
        assert_eq!(
            unsafe { rusqlite::ffi::sqlite3_finalize(raw) },
            rusqlite::ffi::SQLITE_OK
        );
        assert_eq!(
            custody.lock(Fault::Clear),
            Err(Error("injected-arena-clear"))
        );
        assert_eq!(custody.state(), State::LockFailed);
        custody.lock(Fault::None).unwrap();
        assert_eq!(custody.state(), State::Locked);
        assert!(custody.read_key_for_test().is_err());
    }
}
