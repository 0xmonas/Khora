'use client';

import { usePixelate } from './PixelateContext';
import { InputForm } from './components/InputForm';
import { OutputSection } from './components/OutputSection';

export function PixelatePage() {
  const { uploadedImage } = usePixelate();

  return (
    <div className="bg-background p-4 sm:p-8 lg:p-12">
      <div className="grid grid-cols-12">
        <div className="col-span-0 sm:col-span-1" />
        <div className="col-span-12 sm:col-span-10">
          <div className="flex flex-col lg:items-start lg:flex-row gap-8 lg:gap-16">
            <div className="w-full lg:w-[300px]">
              <InputForm />
            </div>
            {uploadedImage && (
              <div className="flex-1">
                <OutputSection />
              </div>
            )}
          </div>
        </div>
        <div className="col-span-0 sm:col-span-1" />
      </div>
    </div>
  );
} 