using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Moq;
using Survey.Storage;

namespace Survey.Tests;

public sealed class StorageConfigurationTests
{
    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public void FileStorageIsRejectedOutsideDevelopment(string environment)
    {
        ServiceCollection services = new();
        InvalidOperationException error = Assert.Throws<InvalidOperationException>(() =>
            services.AddSurveyStorage(Configuration(("SurveyStorage:Provider", "File")), Environment(environment)));
        Assert.Contains("Development", error.Message);
    }

    [Theory]
    [InlineData(null, "Cosmos:Endpoint")]
    [InlineData("unknown", "SurveyStorage:Provider")]
    [InlineData("File", "SurveyStorage:FilePath")]
    public void MissingAndInvalidConfigurationFailsExplicitly(string? provider, string expected)
    {
        ServiceCollection services = new();
        InvalidOperationException error = Assert.Throws<InvalidOperationException>(() =>
            services.AddSurveyStorage(Configuration(("SurveyStorage:Provider", provider)), Environment("Development")));
        Assert.Contains(expected, error.Message);
    }

    [Fact]
    public void DefaultProviderIsSingletonCosmosWithoutMakingNetworkRequests()
    {
        ServiceCollection services = new();
        services.AddSurveyStorage(Configuration(
            ("Cosmos:Endpoint", "https://example.documents.azure.com:443/"),
            ("Cosmos:DatabaseName", "survey"),
            ("Cosmos:ContainerName", "responses")), Environment("Production"));
        using ServiceProvider provider = services.BuildServiceProvider();
        Assert.IsType<CosmosSurveyRepository>(provider.GetRequiredService<ISurveyRepository>());
        Assert.Same(provider.GetRequiredService<ISurveyRepository>(), provider.GetRequiredService<ISurveyRepository>());
        Assert.Same(provider.GetRequiredService<CosmosClient>(), provider.GetRequiredService<CosmosClient>());
    }

    [Fact]
    public void FileStorageIsSingletonInDevelopment()
    {
        string directory = Path.Combine(Path.GetTempPath(), $"survey-config-{Guid.NewGuid():N}");
        try
        {
            ServiceCollection services = new();
            services.AddSurveyStorage(Configuration(
                ("SurveyStorage:Provider", "File"),
                ("SurveyStorage:FilePath", Path.Combine(directory, "responses.json"))), Environment("Development"));
            using ServiceProvider provider = services.BuildServiceProvider();
            Assert.IsType<FileSurveyRepository>(provider.GetRequiredService<ISurveyRepository>());
            Assert.Same(provider.GetRequiredService<ISurveyRepository>(), provider.GetRequiredService<ISurveyRepository>());
        }
        finally
        {
            if (Directory.Exists(directory))
            {
                Directory.Delete(directory, recursive: true);
            }
        }
    }

    private static IConfiguration Configuration(params (string Key, string? Value)[] values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values.Select(value =>
            new KeyValuePair<string, string?>(value.Key, value.Value))).Build();

    private static IHostEnvironment Environment(string name)
    {
        Mock<IHostEnvironment> environment = new();
        environment.SetupGet(value => value.EnvironmentName).Returns(name);
        environment.SetupGet(value => value.ContentRootPath).Returns(AppContext.BaseDirectory);
        return environment.Object;
    }
}
