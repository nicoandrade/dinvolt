"use client";

import { use, useEffect } from "react";

// The route is dynamic; observing its ID must not suspend the static page shell.
const UserRouteSync = ({
  params,
  onChange,
}: {
  params: Promise<{ userId: string }>;
  onChange: (id: string) => void;
}) => {
  const { userId } = use(params);
  useEffect(() => {
    onChange(userId);
  }, [onChange, userId]);
  return null;
};

export { UserRouteSync };
