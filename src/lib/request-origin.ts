/** Use the public application URL: Next.js may normalize the internal request host. */
export function applicationOrigin(req: Request) {
  return new URL(process.env.NEXTAUTH_URL || req.url).origin;
}
