import type { SVGProps } from "react";
import React from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

const Check = ({
  fill = "currentColor",
  secondaryfill: _secondaryfill,
  width = "1em",
  height = "1em",
  title = "Check",
  ...props
}: IconProps) => (
  <svg
    height={height}
    width={width}
    viewBox="0 0 18 18"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>{title}</title>
    <g fill={fill}>
      <polyline
        fill="none"
        points="2.75 9.25 6.75 14.25 15.25 3.75"
        stroke={fill}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </g>
  </svg>
);

export default Check;
