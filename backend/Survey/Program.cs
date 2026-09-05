using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Survey.Storage;

IHost host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices((context, services) =>
    {
        services.AddSingleton(TimeProvider.System);
        services.AddSurveyStorage(context.Configuration, context.HostingEnvironment);
    })
    .Build();

// 設定エラーは初回リクエストまで遅延させず、起動時に明示する。
_ = host.Services.GetRequiredService<ISurveyRepository>();
await host.RunAsync();
