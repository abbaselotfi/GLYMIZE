import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./profile-subnav.module.css";

export default function ProfileLayout({children}:{children:ReactNode}){
  return <>
    <nav className={styles.nav} aria-label="Profile sections">
      <Link className={styles.link} href="/profile"><span className={styles.icon}>ID</span><span>پروفایل و فضای کار</span></Link>
      <Link className={styles.link} href="/profile/security"><span className={styles.icon}>SC</span><span>امنیت و رمز عبور</span></Link>
    </nav>
    {children}
  </>;
}
