import { NavLink } from 'react-router-dom';

const ITEMS = [
  { to: '/live', label: 'Go Live', icon: '⚡' },
  { to: '/map', label: 'Map', icon: '🗺️' },
  { to: '/chats', label: 'Chats', icon: '💬' },
  { to: '/profile', label: 'Profile', icon: '👤' },
] as const;

export default function BottomNav(): React.JSX.Element {
  return (
    <nav
      className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around"
      style={{
        height: 'var(--nav-h)',
        background: 'rgba(17,17,17,0.9)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--s4)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className="flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wide"
          style={({ isActive }) => ({ color: isActive ? 'var(--hot)' : 'var(--mt)' })}
        >
          <span className="text-xl">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
