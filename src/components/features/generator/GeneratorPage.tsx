import { useState, useEffect } from 'react';
import { InputForm, OutputSection } from './components';
import { usePrivy } from '@privy-io/react-auth';

export default function GeneratorPage() {
 const { login, authenticated, ready } = usePrivy();
 const [isLoading, setIsLoading] = useState(true);

 useEffect(() => {
   if (ready) {
     setIsLoading(false);
   }
 }, [ready]);

 if (isLoading) {
   return (
     <div className="flex items-center justify-center min-h-screen">
       <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
     </div>
   );
 }

 if (!authenticated) {
  return (
    <div className="flex justify-center mt-72"> {/* mt-16'yı mt-32 olarak değiştirdik */}
      <div className="w-full max-w-md mx-4 p-6 bg-white dark:bg-neutral-900 border-2 border-neutral-700 dark:border-neutral-200">
        <div className="flex flex-col items-center">
          <h3 className="font-mono text-lg mb-6 dark:text-white">Welcome to Khôra</h3>
          <button
            onClick={login}
            className="p-3 w-full sm:w-auto border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 font-mono text-sm"
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
  
 }

 return (
   <div className="bg-background p-4 sm:p-8 lg:p-12">
     <div className="grid grid-cols-12">
       <div className="col-span-0 sm:col-span-1" />
       <div className="col-span-12 sm:col-span-10">
         <div className="flex flex-col lg:items-start lg:flex-row gap-8 lg:gap-16">
           <div className="w-full lg:w-[300px]">
             <InputForm />
           </div>
           <div className="flex-1">
             <OutputSection />
           </div>
         </div>
       </div>
       <div className="col-span-0 sm:col-span-1" />
     </div>
   </div>
 );
}