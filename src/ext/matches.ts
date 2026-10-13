/** URLs the content script inspects. It only acts when the response is plain text. */
export const MATCHES = [
  '*://*/*.md',
  '*://*/*.md?*',
  '*://*/*.markdown',
  '*://*/*.markdown?*',
  'file:///*.md',
  'file:///*.markdown',
];
