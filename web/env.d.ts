/// <reference types="vite/client" />

declare module '*.md?raw' {
  const text: string;
  export default text;
}

// File System Access and launch handling are Chromium-only and missing from lib.dom.
interface Window {
  showOpenFilePicker?(options?: {
    types?: { description?: string; accept: Record<string, string[]> }[];
  }): Promise<FileSystemFileHandle[]>;
  showDirectoryPicker?(): Promise<FileSystemDirectoryHandle>;
  launchQueue?: {
    setConsumer(consumer: (params: { files: FileSystemHandle[] }) => void): void;
  };
}

interface DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}

interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
}
