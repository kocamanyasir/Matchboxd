import Link from "next/link";
import { Film, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#14181C] text-white flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="max-w-md w-full bg-[#1B2228] border border-[#2C3440] rounded-2xl p-8 shadow-2xl space-y-4">
        <div className="w-12 h-12 rounded-full bg-[#2C3440] flex items-center justify-center mx-auto text-[#00E054]">
          <Film className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-white">404 - Page Not Found</h2>
        <p className="text-sm text-[#9AB0C6]">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="w-full inline-flex items-center justify-center space-x-2 bg-[#00E054] hover:bg-[#00c549] text-black font-bold py-3 px-4 rounded-xl transition-all shadow-lg"
        >
          <Home className="w-4 h-4" />
          <span>Return Home</span>
        </Link>
      </div>
    </div>
  );
}
