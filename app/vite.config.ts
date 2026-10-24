import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// mode "single": gói toàn bộ app thành 1 file HTML (để chia sẻ/xem trên điện thoại không cần server)
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "single" ? [viteSingleFile()] : [])],
  base: "./",
  server: { fs: { allow: [".."] } },
  build: { outDir: mode === "single" ? "dist-single" : "dist" },
}));
