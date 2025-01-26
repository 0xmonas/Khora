// components/ui/custom-scroll-area.tsx
'use client';

import { ReactNode } from "react";

interface CustomScrollAreaProps {
 children: ReactNode;
 className?: string;
}

export const CustomScrollArea = ({ children, className = "" }: CustomScrollAreaProps) => {
 return (
   <div className={`custom-scrollbar overflow-auto ${className}`}>
     {children}
     <style jsx>{`
       .custom-scrollbar {
         scrollbar-gutter: stable;
       }
       .custom-scrollbar::-webkit-scrollbar {
         width: 2px;
         height: 2px;
       }
       .custom-scrollbar::-webkit-scrollbar-track {
         background: transparent;
       }
       .custom-scrollbar::-webkit-scrollbar-thumb {
         background: black;
         border-radius: 9999px;
         min-width: 2px;
         min-height: 2px;
       }
       .custom-scrollbar::-webkit-scrollbar-corner {
         background: transparent;
       }
     `}</style>
   </div>
 );
};