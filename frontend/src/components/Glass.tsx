import { type ReactNode, type MouseEvent } from 'react';
import { twMerge } from 'tailwind-merge';

interface Props {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  inset?: boolean;
  onClick?: (e: MouseEvent) => void;
}

export default function Glass({ children, className = '', strong = false, inset = false, onClick }: Props) {
  const cls = twMerge(
    inset ? 'glass-inset' : strong ? 'glass-strong' : 'glass',
    'rounded-2xl relative',
    className,
  );
  return (
    <div className={cls} onClick={onClick}>
      {children}
    </div>
  );
}
