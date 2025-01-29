import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/providers/theme-provider';

export function HeroSection() {
 const { theme } = useTheme();
 const router = useRouter();

 return (
   <div className="flex-1 flex flex-col">
     <div className="p-4 sm:p-8 lg:p-8">
       <div className="grid grid-cols-12">
         <div className="col-span-0 sm:col-span-1" />
         <div className="col-span-12 sm:col-span-10">
           {/* Hero Section */}
           <div className="flex flex-col items-center">
             <div className="w-full max-w-[1200px] mx-auto aspect-[5/2] relative">
               <Image
                 src={theme === 'dark' ? '/khoradark.png' : '/khoralogo.png'}
                 alt="Khora Logo"
                 fill
                 loading="eager"
                 sizes="(max-width: 768px) 100vw, 1200px"
                 className="object-contain"
                 priority
               />
             </div>
             <p className="font-mono text-lg sm:text-xl text-muted-foreground max-w-2xl text-center mt-12">
               We've reimagined how AI characters come to life—so you can shape yours effortlessly.
             </p>
             <button 
               onClick={() => router.replace('/generator')}
               className="h-10 sm:h-12 px-4 border-2 border-primary bg-background text-foreground font-mono hover:bg-accent transition-colors w-fit mt-8"
             >
               Generate
             </button>
           </div>

           {/* Social Links Grid */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 mt-24">
             {/* Twitter/X Card */}
             <a href="https://x.com/khorafun" className="bg-neutral-50 dark:bg-card p-3 lg:p-5 rounded-none">
               <h3 className="font-mono text-xs lg:text-sm text-foreground text-center">
                 Follow <span className="text-red-500 hover:text-foreground transition-colors cursor-pointer" style={{ color: '#3205fa' }}>@khorafun</span> on X for latest update and news
               </h3>
               <div className="w-10 h-10 lg:w-16 lg:h-16 mx-auto mt-3">
                 {/* Place eye image here */}
               </div>
             </a>

             {/* Telegram Card */}
             <a href="https://x.com/khorafun" className="bg-neutral-50 dark:bg-card p-3 lg:p-5 rounded-none">
               <h3 className="font-mono text-xs lg:text-sm text-foreground text-center">
                 Join <span className="text-red-500 hover:text-foreground transition-colors cursor-pointer" style={{ color: '#3205fa' }}>Telegram</span> Community
               </h3>
               <div className="w-10 h-10 lg:w-16 lg:h-16 mx-auto mt-3">
                 {/* Place telegram icon here */}
               </div>
             </a>

             {/* About Card */}
             <a href="https://medium.com/khorafun" className="bg-neutral-50 dark:bg-card p-3 lg:p-5 rounded-none">
               <h3 className="font-mono text-xs lg:text-sm text-foreground text-center">
                 About Khora
               </h3>
               <div className="w-10 h-10 lg:w-16 lg:h-16 mx-auto mt-3">
                 {/* Place Khora icon here */}
               </div>
             </a>
           </div>

           {/* Contract Box */}
           <div className="mt-12 border-2 border-border bg-card">
             <div className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
               <span className="font-mono text-sm text-foreground">
                 $KHORA
               </span>
               <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                 <div className="font-mono text-xs break-all text-muted-foreground">
                   Monas was here
                 </div>
                 <div className="flex gap-2">
                   <Link 
                     href="https://dexscreener.com/solana/x"
                     target="_blank"
                     rel="noopener noreferrer"
                   >
                     <Image
                       src="/dex-screener.png" 
                       alt="Dex Screener"
                       width={24}
                       height={24}
                       className="rounded-full cursor-pointer hover:opacity-80 transition-opacity"
                     />
                   </Link>
                   <Link 
                     href="https://pump.fun/coin/x"
                     target="_blank"
                     rel="noopener noreferrer"
                   >
                     <Image
                       src="/pump_fun_logo.png"
                       alt="Pump Fun"
                       width={24}
                       height={24}
                       className="rounded-full cursor-pointer hover:opacity-80 transition-opacity"
                     />
                   </Link>
                 </div>
               </div>
             </div>
           </div>
         </div>
         <div className="col-span-0 sm:col-span-1" />
       </div>
     </div>
   </div>
 );
}