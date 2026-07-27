"use client";

import { useState } from "react";

export interface TabItem {
  label: React.ReactNode;
  content: React.ReactNode;
}

export function Tabs({ items }: { items: TabItem[] }) {
  const [active, setActive] = useState(0);

  return (
    <div>
      {/* Au doigt : bande qui défile bord à bord. À la souris : on passe en
          retour à la ligne — sans barre de défilement visible, les derniers
          onglets (Bilans, Notes privées…) étaient inatteignables sur ordinateur. */}
      <div className="scrollbar-none -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 pointer-fine:mx-0 pointer-fine:flex-wrap pointer-fine:overflow-x-visible pointer-fine:px-0">
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              i === active
                ? "bg-navy-800 text-white"
                : "border border-navy-200 bg-white text-navy-500"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item, i) => (
        <div key={i} className={i === active ? "" : "hidden"}>
          {item.content}
        </div>
      ))}
    </div>
  );
}
