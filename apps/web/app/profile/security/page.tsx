import styles from "./security.module.css";

export default function ProfileSecurityPage(){
  return <main className={styles.page}>
    <section className={styles.hero}><span>SECURITY</span><h1>امنیت و رمز عبور</h1><p>مدیریت رمز ورود پزشک از حساب مدیریت GitHub جدا نگه داشته می‌شود.</p></section>
    <section className={styles.card}><h2>رمز عبور</h2><p>این بخش پس از فعال‌شدن سرویس ذخیره امن credential در Runtime فعال می‌شود.</p></section>
  </main>;
}
