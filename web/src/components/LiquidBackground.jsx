import { motion } from 'framer-motion';

export default function LiquidBackground({ theme }) {
  const blobColor = theme === 'dark' ? 'bg-white' : 'bg-black';

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center">
      {/* SVG Goo Filter Definition */}
      <svg className="hidden">
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="25" result="blur" />
            <feColorMatrix 
              in="blur" 
              mode="matrix" 
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 35 -15" 
              result="goo" 
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      {/* Blobs Container */}
      <div className="absolute inset-0 w-full h-full liquid-filter flex items-center justify-center opacity-[0.08] dark:opacity-[0.12] transition-opacity duration-1000">
        
        <motion.div
          animate={{
            x: [0, 200, -150, 0],
            y: [0, -200, 150, 0],
            scale: [1, 1.3, 0.7, 1],
            rotate: [0, 90, 180, 360]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute w-[500px] h-[500px] rounded-full blur-2xl ${blobColor}`}
        />

        <motion.div
          animate={{
            x: [0, -200, 150, 0],
            y: [0, 200, -150, 0],
            scale: [1, 0.8, 1.4, 1],
            rotate: [360, 180, 90, 0]
          }}
          transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute w-[450px] h-[450px] rounded-[40%] blur-3xl ${blobColor}`}
        />

        <motion.div
          animate={{
            x: [150, -100, 200, 150],
            y: [-150, 200, 100, -150],
            scale: [1.2, 0.9, 1.1, 1.2],
          }}
          transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute w-[600px] h-[600px] rounded-full blur-3xl ${blobColor}`}
        />
      </div>
      
      {/* Noise Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.06] mix-blend-overlay" 
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />
    </div>
  );
}
