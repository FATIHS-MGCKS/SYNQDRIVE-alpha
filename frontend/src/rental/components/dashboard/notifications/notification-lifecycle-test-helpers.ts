import { act } from 'react';

function dispatchClick(element: Element | null | undefined) {
  act(() => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

export function expandNotificationGroup(container: HTMLElement) {
  const toggle = container.querySelector('button');
  dispatchClick(toggle);
}

export function expandNotificationLeafDetails(container: HTMLElement) {
  const expand = container.querySelector('button[aria-label="Show details"]');
  dispatchClick(expand);
}

export function queryMoreActionsButtons(root: ParentNode = document): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll('button[aria-label="More actions"]'));
}

export function openMoreActionsMenu(index = 0, root: ParentNode = document) {
  const buttons = queryMoreActionsButtons(root);
  const button = buttons[index];
  if (!button) {
    throw new Error(`More actions button at index ${index} not found (found ${buttons.length})`);
  }
  dispatchClick(button);
}

export function clickPopoverMenuItem(labelSubstring: string) {
  const menuItem = Array.from(document.body.querySelectorAll('button')).find((btn) =>
    btn.textContent?.includes(labelSubstring),
  );
  if (!menuItem) {
    throw new Error(`Popover menu item containing "${labelSubstring}" not found`);
  }
  dispatchClick(menuItem);
}

export function acknowledgeViaMoreActions(index = 0, root: ParentNode = document) {
  openMoreActionsMenu(index, root);
  clickPopoverMenuItem('Acknowledge');
}

export function snoozeViaMoreActions(index = 0, root: ParentNode = document) {
  openMoreActionsMenu(index, root);
  clickPopoverMenuItem('Remind later');
}
