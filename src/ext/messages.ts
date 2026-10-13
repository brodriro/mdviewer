export type Message =
  | { type: 'mdv:fetch'; url: string }
  | { type: 'mdv:mermaid' }
  | { type: 'mdv:options' };

export type FetchReply = { ok: true; text: string } | { ok: false };
