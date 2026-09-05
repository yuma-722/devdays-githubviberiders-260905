using Azure.Identity;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Survey.Storage;

public static class StorageRegistration
{
    public static IServiceCollection AddSurveyStorage(
        this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        string provider = configuration["SurveyStorage:Provider"] ?? "Cosmos";
        if (string.Equals(provider, "File", StringComparison.OrdinalIgnoreCase))
        {
            if (!environment.IsDevelopment())
            {
                throw new InvalidOperationException("FileストレージはDevelopment環境でのみ使用できます。");
            }
            string filePath = Required(configuration, "SurveyStorage:FilePath");
            string absolutePath = Path.GetFullPath(filePath, environment.ContentRootPath);
            services.AddSingleton<ISurveyRepository>(_ => new FileSurveyRepository(absolutePath));
            return services;
        }
        if (!string.Equals(provider, "Cosmos", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("SurveyStorage:ProviderはCosmosまたはFileを指定してください。");
        }

        string endpoint = Required(configuration, "Cosmos:Endpoint");
        string database = Required(configuration, "Cosmos:DatabaseName");
        string container = Required(configuration, "Cosmos:ContainerName");
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out Uri? endpointUri) || endpointUri.Scheme != Uri.UriSchemeHttps)
        {
            throw new InvalidOperationException("Cosmos:EndpointにHTTPSの絶対URLを指定してください。");
        }
        services.AddSingleton(_ => new CosmosClient(endpoint, new DefaultAzureCredential(),
            new CosmosClientOptions { UseSystemTextJsonSerializerWithOptions = SurveyJson.Options }));
        services.AddSingleton<ISurveyRepository>(provider =>
            new CosmosSurveyRepository(provider.GetRequiredService<CosmosClient>().GetContainer(database, container)));
        return services;
    }

    private static string Required(IConfiguration configuration, string name)
    {
        string? value = configuration[name];
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException($"設定{name}は必須です。");
        }
        return value;
    }
}
