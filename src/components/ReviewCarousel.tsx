import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

type PublicReview = {
  id: string;
  church_name: string;
  quote: string;
  rating: number;
  author_name: string;
  author_role: string;
};

/**
 * Reviews church administrators submit through ReviewPrompt, once Prime Haven
 * has approved them from the operator console. Renders nothing until there is
 * at least one approved review, so an empty platform never shows a blank carousel.
 */
export function ReviewCarousel() {
  const { data, isLoading } = useQuery({
    queryKey: ["public-reviews"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_reviews");
      if (error) throw error;
      return (data ?? []) as PublicReview[];
    },
  });

  if (isLoading || !data?.length) return null;

  return (
    <Carousel opts={{ align: "start", loop: data.length > 1 }} className="mt-14">
      <CarouselContent>
        {data.map((review) => (
          <CarouselItem key={review.id} className="sm:basis-1/2 lg:basis-1/3">
            <blockquote className="flex h-full min-h-64 flex-col justify-between rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 p-7 backdrop-blur-lg">
              <div>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={index}
                      className={`size-3.5 ${index < review.rating ? "fill-primary-foreground text-primary-foreground" : "text-primary-foreground/30"}`}
                    />
                  ))}
                </div>
                <p className="mt-4 text-lg leading-relaxed">“{review.quote}”</p>
              </div>
              <footer className="mt-8 flex items-center gap-3 text-sm">
                <span className="grid size-9 place-items-center rounded-full bg-primary-foreground font-bold text-primary">
                  {review.author_name.charAt(0)}
                </span>
                <span>
                  <strong className="block">{review.author_name}</strong>
                  <span className="text-primary-foreground/65">
                    {review.author_role ? `${review.author_role} · ` : ""}
                    {review.church_name}
                  </span>
                </span>
              </footer>
            </blockquote>
          </CarouselItem>
        ))}
      </CarouselContent>
      {data.length > 1 && (
        <div className="mt-6 flex justify-end gap-2">
          <CarouselPrevious className="static translate-y-0 border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" />
          <CarouselNext className="static translate-y-0 border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" />
        </div>
      )}
    </Carousel>
  );
}
