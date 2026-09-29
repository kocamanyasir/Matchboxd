"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#14181C] text-white flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="max-w-md w-full bg-[#1B2228] border border-[#2C3440] rounded-2xl p-8 shadow-2xl space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-900/30 border border-red-500/40 flex items-center justify-center mx-auto text-red-400">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-white">An Error Occurred</h2>
        <p className="text-sm text-[#9AB0C6]">
          {error.message || "An unexpected error occurred while loading the page."}
        </p>
        <button
          onClick={() => reset()}
          className="w-full mt-4 bg-[#00E054] hover:bg-[#00c549] text-black font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center space-x-2 shadow-lg"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Try Again</span>
        </button>
      </div>
    </div>
  );
}
