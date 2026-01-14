import { getUserDoc } from "./firestore";

export async function getDisplayNameForUser(params: {
  uid: string;
  email?: string | null;
}): Promise<string> {
  try {
    const doc = await getUserDoc(params.uid);
    const name = (doc?.name ?? "").trim();
    if (name) return name;
  } catch {
    // ignore
  }

  const email = (params.email ?? "").trim();
  if (!email) return "";
  return email.split("@")[0] ?? "";
}
