using System.Net;
using Microsoft.Azure.Cosmos;
using Moq;
using Moq.Protected;
using Survey.Storage;

namespace Survey.Tests;

public sealed class CosmosStorageTests
{
    [Fact]
    public async Task ReadsEveryPageAndDisposesIterator()
    {
        SurveyDocument first = TestData.Document(1);
        SurveyDocument second = TestData.Document(5);
        Mock<FeedIterator<SurveyDocument>> iterator = new();
        iterator.SetupSequence(value => value.HasMoreResults).Returns(true).Returns(true).Returns(false);
        iterator.SetupSequence(value => value.ReadNextAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Page(first)).ReturnsAsync(Page(second));
        Mock<Container> container = new();
        container.Setup(value => value.GetItemQueryIterator<SurveyDocument>(
            It.Is<QueryDefinition>(query => query.QueryText == "SELECT * FROM c"), null, null)).Returns(iterator.Object);
        CosmosSurveyRepository repository = new(container.Object);
        IReadOnlyList<SurveyDocument> documents = await repository.GetAllAsync();
        Assert.Equal(new[] { first.Id, second.Id }, documents.Select(document => document.Id));
        iterator.Verify(value => value.ReadNextAsync(It.IsAny<CancellationToken>()), Times.Exactly(2));
        iterator.Protected().Verify("Dispose", Times.Once(), true, new object[] { true });
    }

    [Fact]
    public async Task CreatesWithDatePartitionKey()
    {
        SurveyDocument document = TestData.Document();
        Mock<Container> container = new();
        container.Setup(value => value.CreateItemAsync(document, new PartitionKey(document.Date),
            null, It.IsAny<CancellationToken>())).ReturnsAsync(Mock.Of<ItemResponse<SurveyDocument>>());
        CosmosSurveyRepository repository = new(container.Object);
        await repository.AddAsync(document);
        container.Verify(value => value.CreateItemAsync(document, new PartitionKey("2026-09-05"),
            null, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CosmosFailureIsPropagatedWithoutFallback()
    {
        Mock<Container> container = new();
        container.Setup(value => value.CreateItemAsync(
            It.IsAny<SurveyDocument>(), It.IsAny<PartitionKey?>(), null, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new CosmosException("unavailable", HttpStatusCode.ServiceUnavailable, 0, "test", 0));
        CosmosSurveyRepository repository = new(container.Object);
        await Assert.ThrowsAsync<CosmosException>(() => repository.AddAsync(TestData.Document()));
    }

    private static FeedResponse<SurveyDocument> Page(params SurveyDocument[] documents)
    {
        Mock<FeedResponse<SurveyDocument>> page = new();
        page.Setup(value => value.GetEnumerator()).Returns(() => ((IEnumerable<SurveyDocument>)documents).GetEnumerator());
        return page.Object;
    }
}
