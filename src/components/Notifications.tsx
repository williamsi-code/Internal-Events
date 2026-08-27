'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Notice } from '@/lib/notifications';

/**
 * Two surfaces for the same list.
 *
 * A badge in the masthead that is always there and never demands
 * anything, and a toast that appears once per session when something
 * needs acting on. The toast is deliberately dismissible and
 * deliberately does not come back - a notification that reappears on
 * every page becomes something people learn to close without reading.
 */

export default function Notifications({ notices }: { notices: Notice[] }) {
  const [open, setOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const actionable = notices.filter(
    (n) => n.kind === 'action' || n.kind === 'overdue'
  );
  const overdue = notices.filter((n) => n.kind === 'overdue');

  useEffect(() => {
    if (actionable.length === 0) return;
    // Session-scoped so it appears once per visit rather than on every
    // page. A fingerprint of the list means a genuinely new item can
    // surface again within the same session.
    const key = 'ce-toast-' + actionable.map((n) => n.id).join('|');
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // Private browsing and similar. Showing it is the safer failure.
    }
    const t = setTimeout(() => setShowToast(true), 600);
    return () => clearTimeout(t);
  }, [actionable]);

  if (notices.length === 0) {
    return null;
  }

  return (
    <>
      <div className="notif-wrap">
        <button
          className={`notif-bell${overdue.length ? ' has-overdue' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${actionable.length} items need your attention`}
        >
          <span aria-hidden="true">&#9679;</span>
          {actionable.length > 0 && (
            <span className="notif-count">{actionable.length}</span>
          )}
        </button>

        {open && (
          <>
            <button
              className="notif-scrim"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
            />
            <div className="notif-panel" role="dialog" aria-label="Notifications">
              <div className="notif-head">
                <h3>Waiting on you</h3>
                <button className="edit-link" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
              {notices.length === 0 ? (
                <p className="empty" style={{ padding: '1rem' }}>
                  Nothing needs your attention.
                </p>
              ) : (
                <ul className="notif-list">
                  {notices.map((n) => (
                    <li key={n.id} className={n.kind}>
                      <Link href={n.href} onClick={() => setOpen(false)}>
                        <span className="notif-title">{n.title}</span>
                        <span className="notif-detail">{n.detail}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {showToast && actionable.length > 0 && (
        <div className="notif-toast" role="status">
          <div className="notif-toast-body">
            <strong>
              {actionable.length === 1
                ? actionable[0].title
                : `${actionable.length} things need your attention`}
            </strong>
            <span>
              {actionable.length === 1
                ? actionable[0].detail
                : actionable
                    .slice(0, 2)
                    .map((n) => n.title)
                    .join(' \u00b7 ')}
            </span>
          </div>
          <div className="notif-toast-actions">
            <Link
              href={actionable.length === 1 ? actionable[0].href : '#'}
              className="btn btn-primary"
              style={{ textDecoration: 'none' }}
              onClick={(e) => {
                if (actionable.length > 1) {
                  e.preventDefault();
                  setOpen(true);
                }
                setShowToast(false);
              }}
            >
              {actionable.length === 1 ? 'Open' : 'See them'}
            </Link>
            <button
              className="notif-dismiss"
              onClick={() => setShowToast(false)}
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
}
