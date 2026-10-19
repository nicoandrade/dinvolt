import type { SVGProps } from "react";
import React from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  secondaryfill?: string;
  strokewidth?: number;
  title?: string;
};

const CircleChevronLeft = ({
  fill = "currentColor",
  secondaryfill: _secondaryfill,
  width = "1em",
  height = "1em",
  title = "Back",
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
      <path
        d="M9,1C4.589,1,1,4.589,1,9s3.589,8,8,8,8-3.589,8-8S13.411,1,9,1Zm1.53,10.47c.293,.293,.293,.768,0,1.061-.146,.146-.338,.22-.53,.22s-.384-.073-.53-.22l-3-3c-.293-.293-.293-.768,0-1.061l3-3c.293-.293,.768-.293,1.061,0s.293,.768,0,1.061l-2.47,2.47,2.47,2.47Z"
        fill={fill}
      />
    </g>
  </svg>
);

export default CircleChevronLeft;
