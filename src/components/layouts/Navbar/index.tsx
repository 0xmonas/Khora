'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Navbar() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    return pathname === path;
  };

  return (
    <nav className="bg-gray-100 md:hidden">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-around h-12">
          <Link 
            href="/"
            className={`text-sm ${isActive('/') ? 'text-black' : 'text-gray-600'}`}
          >
            Home
          </Link>
          <Link 
            href="/generator"
            className={`text-sm ${isActive('/generator') ? 'text-black' : 'text-gray-600'}`}
          >
            Create
          </Link>
          <Link 
            href="/gallery"
            className={`text-sm ${isActive('/gallery') ? 'text-black' : 'text-gray-600'}`}
          >
            Gallery
          </Link>
          <Link 
            href="/profile"
            className={`text-sm ${isActive('/profile') ? 'text-black' : 'text-gray-600'}`}
          >
            Profile
          </Link>
        </div>
      </div>
    </nav>
  );
}