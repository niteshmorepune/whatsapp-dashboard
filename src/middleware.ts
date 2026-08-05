export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/((?!login|privacy|terms|data-deletion|api/auth|api/webhook|api/send|api/send-template|api/ai/usage|_next/static|_next/image|favicon.ico|sw\\.js).*)",
  ],
};
