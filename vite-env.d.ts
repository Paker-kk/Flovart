declare module '*.md?raw' {
  const content: string;
  export default content;
}

declare const chrome: any;
