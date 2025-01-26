'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';

export function Header() {
 const router = useRouter();
 const { theme, setTheme } = useTheme();

 return (
   <div className="p-8 lg:p-12 bg-background">
     <div className="grid grid-cols-12">
       <div className="col-span-1" />
       <div className="col-span-10">
         <div className="flex items-center justify-between">
           <div className="flex items-center gap-4 cursor-pointer" onClick={() => router.replace('/')}>
             <Image 
               src="/logo.png"
               alt="Logo"
               width={48}
               height={48}
               priority
               className="object-contain bg-[#30f] dark:bg-background"
             />
           </div>
           
           <div className="flex gap-4">
             <button 
               onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
               className="h-10 sm:h-12 px-4 bg-background text-foreground font-mono hover:bg-accent transition-colors w-fit"
               aria-label="Toggle theme"
             >
               {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
             </button>
           </div>
         </div>
       </div>
       <div className="col-span-1" />
     </div>
   </div>
 );
}