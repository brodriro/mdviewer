import '../../src/ext/page.css';
import { describeFileAccess } from '../../src/ext/file-access';

const box = document.querySelector<HTMLElement>('#file-access')!;
const steps = document.querySelector<HTMLElement>('#steps')!;

async function refresh(): Promise<void> {
  steps.hidden = await describeFileAccess(box);
}

void refresh();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void refresh();
});
