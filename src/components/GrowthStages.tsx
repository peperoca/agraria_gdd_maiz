import { CORN_STAGES, getCurrentStage, getNextStage } from '../utils/cornStages';

interface GrowthStagesProps {
  cumulativeGdd: number;
}

// Show a subset of key stages for the progress indicator
const KEY_STAGES = ['VE', 'V6', 'V12', 'VT', 'R1', 'R4', 'R6'];

export function GrowthStages({ cumulativeGdd }: GrowthStagesProps) {
  const currentStage = getCurrentStage(cumulativeGdd);
  const nextStage = getNextStage(cumulativeGdd);
  const keyStages = CORN_STAGES.filter((s) => KEY_STAGES.includes(s.shortName));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-corn-200 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-corn-800">Growth Stages</h3>

      {/* Stage progress bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {keyStages.map((stage, i) => {
          const isPast = cumulativeGdd >= stage.gdd;
          const isCurrent =
            currentStage?.shortName === stage.shortName;

          return (
            <div key={stage.shortName} className="flex items-center">
              {i > 0 && (
                <div
                  className={`h-0.5 w-4 sm:w-6 ${
                    isPast ? 'bg-corn-500' : 'bg-gray-200'
                  }`}
                />
              )}
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all ${
                    isCurrent
                      ? 'bg-corn-600 text-white border-corn-600 ring-2 ring-corn-300 scale-110'
                      : isPast
                        ? 'bg-corn-500 text-white border-corn-500'
                        : 'bg-white text-gray-400 border-gray-300'
                  }`}
                >
                  {isPast && !isCurrent ? '✓' : stage.shortName}
                </div>
                <span
                  className={`text-[9px] mt-1 whitespace-nowrap ${
                    isCurrent ? 'text-corn-700 font-semibold' : 'text-gray-400'
                  }`}
                >
                  {stage.gdd}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Current stage info */}
      {currentStage && (
        <div className="bg-corn-50 rounded-lg p-3">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold text-corn-800">
              {currentStage.shortName} - {currentStage.name}
            </span>
          </div>
          <p className="text-xs text-corn-600">{currentStage.description}</p>
        </div>
      )}

      {/* Next milestone */}
      {nextStage && (
        <div className="bg-earth-50 rounded-lg p-3">
          <p className="text-xs text-earth-700">
            <span className="font-semibold">Next:</span> {nextStage.shortName} -{' '}
            {nextStage.name} at {nextStage.gdd} GDD
          </p>
          <p className="text-xs text-earth-500 mt-1">
            {Math.round(nextStage.gdd - cumulativeGdd)} GDD remaining
          </p>
        </div>
      )}

      {/* All stages detail */}
      <details className="text-xs">
        <summary className="text-gray-500 cursor-pointer hover:text-gray-700">
          View all stages
        </summary>
        <div className="mt-2 space-y-1">
          {CORN_STAGES.map((stage) => {
            const isPast = cumulativeGdd >= stage.gdd;
            return (
              <div
                key={stage.shortName}
                className={`flex items-center gap-2 py-1 ${
                  isPast ? 'text-corn-700' : 'text-gray-400'
                }`}
              >
                <span className="w-4 text-center">{isPast ? '✓' : '○'}</span>
                <span className="font-medium w-8">{stage.shortName}</span>
                <span className="flex-1">{stage.name}</span>
                <span className="text-gray-400">{stage.gdd}</span>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
