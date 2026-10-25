interface ImportMeta {
  glob<T = unknown>(pattern: string, options: { eager: true; query?: string; import?: string }): Record<string, T>;
}
