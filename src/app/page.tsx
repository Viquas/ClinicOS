import { redirect } from "next/navigation";

export default function Home() {
  /* Every role lands on its own home screen now (§7.8) — see /home. */
  redirect("/home");
}
