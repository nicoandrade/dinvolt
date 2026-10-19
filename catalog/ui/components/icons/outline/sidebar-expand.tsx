import type { SVGProps } from "react";
import React from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

const SidebarExpand = ({
  fill = "currentColor",
  secondaryfill,
  width = "1em",
  height = "1em",
  title = "Expand sidebar",
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
          height="11.5"
          width="14.5"
          fill="none"
          rx="2"
          ry="2"
          stroke={fill}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          x="1.75"
          y="3.25"
        />
        <rect
          height="5.5"
          width="2"
          fill={secondaryColor}
          stroke={secondaryColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          x="4.75"
          y="6.25"
        />
      </g>
    </svg>
  );
};

export default SidebarExpand;
