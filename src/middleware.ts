export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/((?!login|privacy|terms|data-deletion|api/auth|api/webhook|api/send|_next/static|_next/image|favicon.ico|sw\\.js).*)",
  ],
};
