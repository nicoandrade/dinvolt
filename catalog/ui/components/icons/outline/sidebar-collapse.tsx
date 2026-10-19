import type { SVGProps } from "react";
import React from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

const SidebarCollapse = ({
  fill = "currentColor",
  secondaryfill,
  width = "1em",
  height = "1em",
  title = "Collapse sidebar",
  ...props
}: IconProps) => {
  const secondaryColor = secondaryfill || fill;

  return (
    <svg
      height={height}
      width={width}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>{title}</title>
      <g fill={fill}>
        <rect
          height="12.5"
          width="14.5"
          fill="none"
          rx="2"
          ry="2"
          stroke={fill}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          x="1.75"
          y="2.75"
        />
        <line
          fill="none"
          stroke={secondaryColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          x1="4.75"
          x2="4.75"
          y1="5.75"
          y2="12.25"
        />
      </g>
    </svg>
  );
};

export default SidebarCollapse;
