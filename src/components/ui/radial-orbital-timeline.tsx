"use client";
import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface OrbitalItem {
  id: number;
  /** Sponsor name shown under the node and as the card title. */
  title: string;
  /** Short role tag (e.g. "Retrieval"), shown top-right of the card. */
  date: string;
  /** The full explanation revealed on click. */
  content: string;
  /** One-word category shown in the badge. */
  category: string;
  icon: React.ElementType;
  /** Other node ids this one is wired to (drives the "Works with" links). */
  relatedIds: number[];
  status: "completed" | "in-progress" | "pending";
  /** Visual weight 0–100 — sizes the node's glow. */
  energy: number;
}

interface RadialOrbitalTimelineProps {
  timelineData: OrbitalItem[];
}

export default function RadialOrbitalTimeline({
  timelineData,
}: RadialOrbitalTimelineProps) {
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>(
    {}
  );
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [centerOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === containerRef.current || e.target === orbitRef.current) {
      setExpandedItems({});
      setAutoRotate(true);
    }
  };

  const toggleItem = (id: number) => {
    setExpandedItems((prev) => {
      const newState = { ...prev };
      Object.keys(newState).forEach((key) => {
        if (parseInt(key) !== id) {
          newState[parseInt(key)] = false;
        }
      });

      newState[id] = !prev[id];

      if (!prev[id]) {
        setAutoRotate(false);
        centerViewOnNode(id);
      } else {
        setAutoRotate(true);
      }

      return newState;
    });
  };

  useEffect(() => {
    let rotationTimer: ReturnType<typeof setInterval>;

    if (autoRotate) {
      rotationTimer = setInterval(() => {
        setRotationAngle((prev) => {
          const newAngle = (prev + 0.3) % 360;
          return Number(newAngle.toFixed(3));
        });
      }, 50);
    }

    return () => {
      if (rotationTimer) {
        clearInterval(rotationTimer);
      }
    };
  }, [autoRotate]);

  const centerViewOnNode = (nodeId: number) => {
    if (!nodeRefs.current[nodeId]) return;

    const nodeIndex = timelineData.findIndex((item) => item.id === nodeId);
    const totalNodes = timelineData.length;
    const targetAngle = (nodeIndex / totalNodes) * 360;

    setRotationAngle(270 - targetAngle);
  };

  const calculateNodePosition = (index: number, total: number) => {
    const angle = ((index / total) * 360 + rotationAngle) % 360;
    const radius = 260;
    const radian = (angle * Math.PI) / 180;

    // Round trig-derived values: Math.cos/sin can differ in their final
    // digits between the Node (SSR) and browser (hydration) environments,
    // which would otherwise produce mismatched inline-style strings.
    const round = (n: number) => Number(n.toFixed(3));

    const x = round(radius * Math.cos(radian) + centerOffset.x);
    const y = round(radius * Math.sin(radian) + centerOffset.y);

    const zIndex = Math.round(100 + 50 * Math.cos(radian));
    const opacity = round(
      Math.max(0.4, Math.min(1, 0.4 + 0.6 * ((1 + Math.sin(radian)) / 2)))
    );

    return { x, y, angle, zIndex, opacity };
  };

  const getStatusStyles = (status: OrbitalItem["status"]): string => {
    switch (status) {
      case "completed":
        return "text-white bg-accent border-accent";
      case "in-progress":
        return "text-accent bg-accent/10 border-accent/30";
      case "pending":
        return "text-muted bg-foreground/5 border-foreground/15";
      default:
        return "text-muted bg-foreground/5 border-foreground/15";
    }
  };

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center bg-transparent overflow-hidden"
      ref={containerRef}
      onClick={handleContainerClick}
    >
      <div className="relative w-full max-w-4xl h-full flex items-center justify-center">
        <div
          className="absolute w-full h-full flex items-center justify-center"
          ref={orbitRef}
          style={{
            perspective: "1000px",
            transform: `translate(${centerOffset.x}px, ${centerOffset.y}px)`,
          }}
        >
          <div className="pointer-events-none absolute w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 via-sky-400 to-cyan-400 animate-pulse flex items-center justify-center z-10 shadow-lg shadow-accent/30">
            <div className="absolute w-20 h-20 rounded-full border border-accent/30 animate-ping opacity-70"></div>
            <div
              className="absolute w-24 h-24 rounded-full border border-accent/20 animate-ping opacity-50"
              style={{ animationDelay: "0.5s" }}
            ></div>
            <div className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-md"></div>
          </div>

          <div className="pointer-events-none absolute w-[520px] h-[520px] rounded-full border border-foreground/10"></div>

          {timelineData.map((item, index) => {
            const position = calculateNodePosition(index, timelineData.length);
            const isExpanded = expandedItems[item.id];
            const Icon = item.icon;

            const nodeStyle = {
              transform: `translate(${position.x}px, ${position.y}px)`,
              zIndex: isExpanded ? 200 : position.zIndex,
              opacity: isExpanded ? 1 : position.opacity,
            };

            return (
              <div
                key={item.id}
                ref={(el) => {
                  nodeRefs.current[item.id] = el;
                }}
                className="absolute transition-all duration-700 cursor-pointer"
                style={nodeStyle}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleItem(item.id);
                }}
              >
                <div
                  className="pointer-events-none absolute rounded-full -inset-1"
                  style={{
                    background: `radial-gradient(circle, rgba(37,99,235,0.18) 0%, rgba(37,99,235,0) 70%)`,
                    width: `${item.energy * 0.5 + 40}px`,
                    height: `${item.energy * 0.5 + 40}px`,
                    left: `-${(item.energy * 0.5 + 40 - 40) / 2}px`,
                    top: `-${(item.energy * 0.5 + 40 - 40) / 2}px`,
                  }}
                ></div>

                <div
                  className={`
                  w-12 h-12 rounded-full flex items-center justify-center
                  ${isExpanded ? "bg-accent text-white" : "bg-white text-accent"}
                  border-2
                  ${
                    isExpanded
                      ? "border-accent shadow-lg shadow-accent/30"
                      : "border-accent/25 shadow-sm shadow-accent/10"
                  }
                  transition-all duration-300 transform
                  ${isExpanded ? "scale-150" : ""}
                `}
                >
                  <Icon size={18} />
                </div>

                <div
                  className={`
                  pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap
                  text-xs font-bold tracking-wider
                  transition-all duration-300
                  ${
                    isExpanded
                      ? "top-[4.5rem] text-accent-strong scale-125"
                      : "top-14 text-accent"
                  }
                `}
                >
                  {item.title}
                </div>

                {isExpanded && (
                  <Card className="absolute top-28 left-1/2 -translate-x-1/2 w-64 bg-white/95 backdrop-blur-lg border-foreground/10 shadow-xl shadow-accent/10 overflow-visible">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-px h-3 bg-accent/40"></div>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <Badge
                          className={`px-2 text-xs ${getStatusStyles(
                            item.status
                          )}`}
                        >
                          {item.category}
                        </Badge>
                        <span className="text-xs font-mono text-muted">
                          {item.date}
                        </span>
                      </div>
                      <CardTitle className="text-sm mt-2 text-foreground">
                        {item.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-foreground/70">
                      <p className="leading-relaxed">{item.content}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
