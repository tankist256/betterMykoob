import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../components/App';
import { DomMykoobAdapter } from '../mykoob/domAdapter';
import './style.css';

if (!document.getElementById('bettermykoob-root') && document.body) {
  const source = document.createElement('div');
  source.id = 'bettermykoob-original';
  while (document.body.firstChild) source.appendChild(document.body.firstChild);
  document.body.appendChild(source);

  const mount = document.createElement('div');
  mount.id = 'bettermykoob-root';
  document.body.appendChild(mount);

  const dialogLayer = document.createElement('div');
  dialogLayer.id = 'bettermykoob-dialog-layer';
  document.body.appendChild(dialogLayer);

  const isVisibleDialog = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getAttribute('aria-hidden') !== 'true';
  };
  const updateDialogLayer = () => {
    dialogLayer.classList.toggle('bm-dialog-open', [...dialogLayer.children].some(child => isVisibleDialog(child as HTMLElement)));
  };
  const moveAssignmentDialog = () => {
    const titles = [...source.querySelectorAll<HTMLElement>('*')].filter(element => element.children.length === 0 && element.textContent?.trim() === 'Обзор задания');
    for (const title of titles) {
      let candidate: HTMLElement | null = title;
      while (candidate && candidate !== source) {
        const name = typeof candidate.className === 'string' ? candidate.className : '';
        const positioned = /^(absolute|fixed)$/.test(getComputedStyle(candidate).position);
        if ((/dialog|modal|popup/i.test(name) || positioned) && /Дата сдачи:/.test(candidate.textContent || '') && /Описание задания:/.test(candidate.textContent || '')) {
          if (isVisibleDialog(candidate)) {
            dialogLayer.appendChild(candidate);
            updateDialogLayer();
          }
          break;
        }
        candidate = candidate.parentElement;
      }
    }
  };
  new MutationObserver(updateDialogLayer).observe(dialogLayer, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'aria-hidden'] });

  const adapter = new DomMykoobAdapter(source);
  source.hidden = true;
  const root = createRoot(mount);
  const hasAssignmentDialogs = /lessonsplan|homework|task/i.test(window.location.search);
  let scheduled = false;
  const render = () => {
    scheduled = false;
    if (hasAssignmentDialogs) moveAssignmentDialog();
    root.render(<React.StrictMode><App snapshot={adapter.read()} adapter={adapter} /></React.StrictMode>);
  };
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(render);
  });
  observer.observe(source, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value', 'selected', 'class', 'style', 'aria-hidden'] });
  // Mykoob renders parts of its chrome after document_idle. Keep those late
  // body additions with the original UI so fixed headers cannot overlay ours.
  const bodyObserver = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node !== mount && node !== source && node !== dialogLayer && node.parentNode === document.body) source.appendChild(node);
    }
  });
  bodyObserver.observe(document.body, { childList: true });
  window.addEventListener('load', render, { once: true });
  render();
}
