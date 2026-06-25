import { useGetAgentConfig, useUpdateAgentConfig, getGetAgentConfigQueryKey, customFetch } from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Save, Terminal, Clock, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";

const configSchema = z.object({
  agentName: z.string().min(1, "Agent name is required"),
  voice: z.string().min(1, "Voice is required"),
  prompt: z.string().min(1, "System prompt is required"),
  firstMessage: z.string().min(1, "First message is required"),
  maxDuration: z.coerce.number().min(1).max(3600),
});

const VOICES = ["maya", "ryan", "adriana", "tina", "matt", "evelyn"];

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Dubai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

type AvailabilityData = {
  id: number;
  timezone: string;
  notificationEmail: string | null;
  availableDays: number[];
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
};

export default function AgentConfigPage() {
  const { data: config, isLoading } = useGetAgentConfig();
  const updateConfig = useUpdateAgentConfig();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof configSchema>>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      agentName: "",
      voice: "maya",
      prompt: "",
      firstMessage: "",
      maxDuration: 600,
    },
  });

  const initializedRef = useRef(false);

  useEffect(() => {
    if (config && !initializedRef.current) {
      form.reset({
        agentName: config.agentName,
        voice: config.voice,
        prompt: config.prompt,
        firstMessage: config.firstMessage,
        maxDuration: config.maxDuration,
      });
      initializedRef.current = true;
    }
  }, [config, form]);

  const onSubmit = (values: z.infer<typeof configSchema>) => {
    updateConfig.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAgentConfigQueryKey() });
        toast({ title: "Configuration Updated", description: "Agent parameters synchronized." });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update configuration.", variant: "destructive" });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh] text-primary font-mono uppercase tracking-widest text-sm">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Loading Config...
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">Agent Configuration</h1>
        <p className="text-muted-foreground mt-1 text-sm">Core parameters for the autonomous voice operative.</p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border bg-background/50">
          <CardTitle className="uppercase tracking-widest text-primary flex items-center text-sm">
            <Terminal className="w-4 h-4 mr-2" />
            System Parameters
          </CardTitle>
          <CardDescription className="font-mono text-xs uppercase">Modify core behavior patterns</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="agentName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="uppercase text-xs tracking-wider text-muted-foreground">Designation (Name)</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-background border-border focus-visible:ring-primary rounded-none font-bold" data-testid="input-agent-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="voice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="uppercase text-xs tracking-wider text-muted-foreground">Vocal Profile</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-background border-border focus:ring-primary rounded-none font-bold capitalize" data-testid="select-voice">
                            <SelectValue placeholder="Select profile" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-card border-border rounded-none">
                          {VOICES.map(v => (
                            <SelectItem key={v} value={v} className="capitalize font-mono text-sm hover:bg-secondary focus:bg-secondary">
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="firstMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase text-xs tracking-wider text-muted-foreground">Initial Transmission</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-background border-border focus-visible:ring-primary rounded-none" data-testid="input-first-message" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="prompt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase text-xs tracking-wider text-muted-foreground">Core Directive (System Prompt)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        className="min-h-[200px] bg-background border-border focus-visible:ring-primary rounded-none font-mono text-sm leading-relaxed resize-y"
                        data-testid="input-prompt"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxDuration"
                render={({ field }) => (
                  <FormItem className="max-w-[200px]">
                    <FormLabel className="uppercase text-xs tracking-wider text-muted-foreground">Max Duration (Seconds)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} className="bg-background border-border focus-visible:ring-primary rounded-none font-mono" data-testid="input-max-duration" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-4 border-t border-border">
                <Button
                  type="submit"
                  disabled={updateConfig.isPending || !form.formState.isDirty}
                  className="uppercase font-bold tracking-widest min-w-[200px] rounded-none"
                  data-testid="button-save-config"
                >
                  {updateConfig.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Synchronize
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <AvailabilitySettings />
    </div>
  );
}

function AvailabilitySettings() {
  const { toast } = useToast();

  const { data: avail, isLoading } = useQuery<AvailabilityData>({
    queryKey: ["availability"],
    queryFn: () => customFetch("/api/availability"),
  });

  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [timezone, setTimezone] = useState("America/New_York");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [slotDuration, setSlotDuration] = useState(30);
  const [notificationEmail, setNotificationEmail] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (avail && !initialized.current) {
      setSelectedDays(avail.availableDays);
      setTimezone(avail.timezone);
      setStartTime(avail.startTime);
      setEndTime(avail.endTime);
      setSlotDuration(avail.slotDurationMinutes);
      setNotificationEmail(avail.notificationEmail ?? "");
      initialized.current = true;
    }
  }, [avail]);

  const saveMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/availability", {
        method: "PUT",
        body: JSON.stringify({
          timezone,
          notificationEmail: notificationEmail || null,
          availableDays: selectedDays,
          startTime,
          endTime,
          slotDurationMinutes: slotDuration,
        }),
      }),
    onSuccess: () => toast({ title: "Availability saved" }),
    onError: () => toast({ title: "Error", description: "Failed to save availability", variant: "destructive" }),
  });

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="border-b border-border bg-background/50">
        <CardTitle className="uppercase tracking-widest text-primary flex items-center text-sm">
          <Clock className="w-4 h-4 mr-2" />
          Availability & Scheduling
        </CardTitle>
        <CardDescription className="font-mono text-xs uppercase">
          Configure when leads can be booked. The AI uses this to schedule calls.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : (
          <>
            {/* Day selector */}
            <div className="space-y-2">
              <Label className="uppercase text-xs tracking-wider text-muted-foreground">Available Days</Label>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map(d => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={`px-3 py-1.5 text-xs uppercase tracking-wider border transition-colors ${
                      selectedDays.includes(d.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="uppercase text-xs tracking-wider text-muted-foreground">Start Time</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="bg-background border-border rounded-none font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="uppercase text-xs tracking-wider text-muted-foreground">End Time</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="bg-background border-border rounded-none font-mono"
                />
              </div>
            </div>

            {/* Timezone + slot duration */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="uppercase text-xs tracking-wider text-muted-foreground">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="bg-background border-border rounded-none font-mono text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border rounded-none">
                    {TIMEZONES.map(tz => (
                      <SelectItem key={tz} value={tz} className="font-mono text-xs">
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="uppercase text-xs tracking-wider text-muted-foreground">Slot Duration (min)</Label>
                <Select value={String(slotDuration)} onValueChange={v => setSlotDuration(Number(v))}>
                  <SelectTrigger className="bg-background border-border rounded-none font-mono text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border rounded-none">
                    {[15, 20, 30, 45, 60].map(m => (
                      <SelectItem key={m} value={String(m)} className="font-mono text-xs">
                        {m} minutes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Notification email */}
            <div className="space-y-1.5">
              <Label className="uppercase text-xs tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Mail className="w-3 h-3" />
                Notification Email
              </Label>
              <Input
                type="email"
                placeholder="you@company.com"
                value={notificationEmail}
                onChange={e => setNotificationEmail(e.target.value)}
                className="bg-background border-border rounded-none font-mono"
              />
              <p className="text-xs text-muted-foreground/60">
                An email confirmation will be sent here whenever a lead books.
              </p>
            </div>

            <div className="flex justify-end pt-4 border-t border-border">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="uppercase font-bold tracking-widest min-w-[200px] rounded-none"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Availability
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
