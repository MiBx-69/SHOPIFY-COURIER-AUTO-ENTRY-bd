export default function SettingsLoading() {
  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8 animate-pulse">
      <div className="mb-6">
        <div className="h-8 w-32 bg-gray-200 dark:bg-gray-800 rounded mb-2"></div>
        <div className="h-4 w-64 bg-gray-200 dark:bg-gray-800 rounded"></div>
      </div>
      
      <div className="flex gap-4 border-b border-gray-200 dark:border-gray-800 mb-6 pb-2">
        <div className="h-6 w-24 bg-gray-200 dark:bg-gray-800 rounded"></div>
        <div className="h-6 w-24 bg-gray-200 dark:bg-gray-800 rounded"></div>
        <div className="h-6 w-24 bg-gray-200 dark:bg-gray-800 rounded"></div>
      </div>

      <div className="flex flex-col gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-[#1C1C1E] rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <div className="h-6 w-32 bg-gray-200 dark:bg-gray-800 rounded mb-4"></div>
            <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-800 rounded mb-6"></div>
            
            <div className="flex flex-col gap-4">
              <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded"></div>
              <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
