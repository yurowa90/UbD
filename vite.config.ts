import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages는 https://<user>.github.io/UbD/ 하위 경로로 서빙되므로
// Pages 빌드일 때만 base를 '/UbD/'로 둔다. 로컬·Vercel(루트 도메인)은 '/'.
// 데이터 fetch는 import.meta.env.BASE_URL을 쓰므로 base를 자동으로 따라간다.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/UbD/" : "/",
  plugins: [react(), tailwindcss()],
});
