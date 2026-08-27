export default function DispatchedLoading() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded"></div>
        <div className="h-10 w-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
      </div>
      <div className="flex gap-2">
        <div className="h-10 flex-1 bg-gray-200 dark:bg-gray-800 rounded"></div>
        <div className="h-10 w-24 bg-gray-200 dark:bg-gray-800 rounded hidden md:block"></div>
        <div className="h-10 w-24 bg-gray-200 dark:bg-gray-800 rounded hidden md:block"></div>
      </div>
      <div className="bg-white dark:bg-[#1C1C1E] rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="h-12 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30"></div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 gap-4">
            <div className="h-4 w-4 bg-gray-200 dark:bg-gray-800 rounded"></div>
            <div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded"></div>
            <div className="h-4 flex-1 bg-gray-200 dark:bg-gray-800 rounded"></div>
            <div className="h-8 w-24 bg-gray-200 dark:bg-gray-800 rounded-full"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
