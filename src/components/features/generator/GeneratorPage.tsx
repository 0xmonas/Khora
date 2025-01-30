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
      <div className="container mx-auto mt-8 p-4">
        <div className="flex flex-col items-center">
          <h1 className="text-2xl font-bold mb-4">Please Sign In</h1>
          <button
            onClick={login}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Sign In
          </button>
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
