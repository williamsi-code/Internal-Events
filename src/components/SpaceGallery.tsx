'use client';

import { useState } from 'react';
import PanZoomImage from './PanZoomImage';
import type { SpacePhoto } from '@/lib/space-detail';

/**
 * The photographs for one room.
 *
 * One large viewable image with thumbnails beneath, rather than a
 * carousel. Someone deciding on a room wants to compare views, not
 * be walked through them.
 */

export default function SpaceGallery({
  photos,
  heroUrl,
  heroAlt,
  spaceName,
}: {
  photos: SpacePhoto[];
  heroUrl: string | null;
  heroAlt: string | null;
  spaceName: string;
}) {
  const all = [
    ...(heroUrl
      ? [
          {
            id: 'hero',
            media_id: 'hero',
            secure_url: heroUrl,
            alt_text: heroAlt,
            title: spaceName,
            caption: null,
            sort_order: -1,
          } as SpacePhoto,
        ]
      : []),
    ...photos,
  ];

  const [active, setActive] = useState(0);

  if (all.length === 0) {
    return (
      <div className="space-noimage">
        <span>Photographs of this room are on the way.</span>
      </div>
    );
  }

  const current = all[Math.min(active, all.length - 1)];

  return (
    <div className="space-gallery">
      <PanZoomImage
        key={current.id}
        src={current.secure_url}
        alt={current.alt_text ?? `${spaceName}`}
        caption={current.caption}
      />

      {all.length > 1 && (
        <div className="space-thumbs">
          {all.map((p, i) => (
            <button
              key={p.id}
              className={`space-thumb${i === active ? ' active' : ''}`}
              onClick={() => setActive(i)}
              aria-label={`View ${p.caption ?? p.title}`}
              aria-current={i === active}
            >
              <img src={p.secure_url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
