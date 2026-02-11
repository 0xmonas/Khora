import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/providers/theme-provider';

export function HeroSection() {
 const { theme } = useTheme();
 const router = useRouter();

 return (
   <div className="flex-1 flex flex-col">
     <div className="p-4 md:p-8 lg:p-12">
       <div className="w-full lg:grid lg:grid-cols-12">
         <div className="hidden lg:block lg:col-span-1" />
         <div className="lg:col-span-10">
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
               We&apos;ve reimagined how AI characters come to life—so you can shape yours effortlessly.
             </p>
             <div className="flex gap-4 mt-8">
               <button
                 onClick={() => router.replace('/generator')}
                 className="h-10 sm:h-12 px-4 border-2 border-primary bg-background text-foreground font-mono hover:bg-accent transition-colors w-fit"
               >
                Generator
               </button>
             </div>
           </div>

         </div>
         <div className="hidden lg:block lg:col-span-1" />
       </div>
     </div>
   </div>
 );
}