import type { SVGProps } from "react";
import React from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

const OpenExternal = ({
  fill = "currentColor",
  secondaryfill,
  width = "1em",
  height = "1em",
  title = "Open external link",
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
        <polyline
          fill="none"
          points="11.25 11.25 11.25 6.75 6.75 6.75"
          stroke={secondaryColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <line
          fill="none"
          stroke={secondaryColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          x1="11.25"
          x2="3.873"
          y1="6.75"
          y2="14.127"
        />
        <path
          d="M3.873,14.127c-2.831-2.831-2.831-7.422,0-10.253,2.831-2.831,7.422-2.831,10.253,0s2.831,7.422,0,10.253c-2.075,2.075-5.094,2.629-7.674,1.663"
          fill="none"
          stroke={fill}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </g>
    </svg>
  );
};

export default OpenExternal;
