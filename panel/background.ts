import { connectHost } from '@openchamber/sdk';
import { captureToInbox, resolveVaultPaths } from './vault-client';

const host = connectHost();

host.onAction(async (item) => {
  if (item.kind === 'selection') {
    const vault = await resolveVaultPaths(host);
    if (!vault.isVault) {
      await host.toast({
        kind: 'error',
        message: 'Current project is not an Ars Contexta vault. Run /arscontexta:setup first.',
      });
      return;
    }

    const { path } = await captureToInbox(host, vault.inboxDir, item.text, {
      source: 'chat-selection',
      sessionId: item.sessionId,
      messageId: item.messageId,
    });
    await host.toast({ kind: 'success', message: `Saved selection to ${path}` });
    return;
  }

  if (item.kind === 'message') {
    const vault = await resolveVaultPaths(host);
    if (!vault.isVault) {
      await host.toast({
        kind: 'error',
        message: 'Current project is not an Ars Contexta vault. Run /arscontexta:setup first.',
      });
      return;
    }

    const { path } = await captureToInbox(host, vault.inboxDir, item.text, {
      source: `${item.role}-message`,
      sessionId: item.sessionId,
      messageId: item.messageId,
      title: item.sessionTitle ? `From ${item.sessionTitle}` : undefined,
    });
    await host.toast({ kind: 'success', message: `Captured message to ${path}` });
    return;
  }

  if (item.kind === 'file') {
    if (item.isDirectory) {
      await host.toast({
        kind: 'info',
        message: 'Select a source file (not a folder) to process with /pipeline.',
      });
      return;
    }

    const vault = await resolveVaultPaths(host);
    if (!vault.isVault) {
      await host.toast({
        kind: 'error',
        message: 'Current project is not an Ars Contexta vault. Run /arscontexta:setup first.',
      });
      return;
    }

    await host.compose({ text: `/pipeline ${item.path}`, mode: 'replace' });
    await host.toast({
      kind: 'success',
      message: `Staged /pipeline ${item.path} in chat.`,
    });
  }
});
