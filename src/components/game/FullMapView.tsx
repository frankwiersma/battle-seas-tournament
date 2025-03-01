import React from "react";
import { X } from "lucide-react";
import { Button } from "../ui/button";

interface FullMapViewProps {
  onClose: () => void;
  hits?: { x: number; y: number; isHit: boolean }[];
}

const FullMapView: React.FC<FullMapViewProps> = ({ onClose, hits = [] }) => {
  const gridSize = 5;
  const letters = ['A', 'B', 'C', 'D', 'E'];
  
  // Create a lookup map for faster access to hit data
  const hitMap = hits.reduce((acc, hit) => {
    acc[`${hit.x},${hit.y}`] = hit.isHit;
    return acc;
  }, {} as Record<string, boolean>);
  
  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose}
          className="rounded-full bg-white/10 hover:bg-white/20 text-white"
        >
          <X className="h-6 w-6" />
        </Button>
      </div>
      
      <h2 className="text-2xl font-bold text-white mb-4">Bucharest Map</h2>
      
      <div className="relative w-full max-w-3xl aspect-square">
        {/* Map Image */}
        <img 
          src="/Bucharest_low_res_map (1).png" 
          alt="Bucharest Map" 
          className="absolute inset-0 w-full h-full object-cover rounded-lg"
        />
        
        {/* Grid Overlay */}
        <div className="absolute inset-0 grid grid-cols-5 grid-rows-5">
          {Array.from({ length: gridSize * gridSize }).map((_, index) => {
            const row = Math.floor(index / gridSize);
            const col = index % gridSize;
            const key = `${col},${row}`;
            const isHit = key in hitMap;
            const isSuccess = hitMap[key];
            
            return (
              <div 
                key={index} 
                className="border border-white/60 relative"
              >
                <div className="absolute top-1 left-1 text-white font-bold text-sm bg-black/50 px-1 rounded">
                  {letters[col]}{row + 1}
                </div>
                
                {isHit && (
                  <div className={`absolute inset-0 flex items-center justify-center ${isSuccess ? 'bg-red-500/30' : 'bg-blue-500/30'}`}>
                    {isSuccess ? (
                      <div className="w-6 h-6 bg-red-500 rounded-full animate-pulse"></div>
                    ) : (
                      <div className="w-6 h-6 border-2 border-blue-500 rounded-full"></div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Column Headers */}
        <div className="absolute top-[-40px] left-0 right-0 flex justify-between px-[10%]">
          {letters.map(letter => (
            <div key={letter} className="text-white font-bold text-xl">{letter}</div>
          ))}
        </div>
        
        {/* Row Headers */}
        <div className="absolute left-[-40px] top-0 bottom-0 flex flex-col justify-between py-[10%]">
          {[1, 2, 3, 4, 5].map(num => (
            <div key={num} className="text-white font-bold text-xl">{num}</div>
          ))}
        </div>
      </div>
      
      <div className="flex items-center gap-8 mt-6">
        <div className="flex items-center">
          <div className="w-4 h-4 bg-red-500 rounded-full mr-2"></div>
          <span className="text-white">Hit</span>
        </div>
        <div className="flex items-center">
          <div className="w-4 h-4 border-2 border-blue-500 rounded-full mr-2"></div>
          <span className="text-white">Miss</span>
        </div>
      </div>
      
      <p className="text-white/70 mt-4 max-w-lg text-center">
        Use this map to coordinate your attacks. The grid shows the exact positions on the battlefield.
      </p>
    </div>
  );
};

export default FullMapView; 