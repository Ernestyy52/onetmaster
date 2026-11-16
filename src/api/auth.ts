// Sign-in for online builds. Offline builds never import this file.
import { supabase } from './supabaseClient';

export async function hasSession(): Promise<boolean> {
  const { data } = await supabase().auth.getSession();
  return !!data.session;
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : error.message);
}

/** Returns true when the account still needs email confirmation before it can sign in. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const { data, error } = await supabase().auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return !data.session;
}

export async function signOut() {
  await supabase().auth.signOut();
}
