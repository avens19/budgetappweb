namespace BudgetAppWeb.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class InitialCreate : DbMigration
    {
        public override void Up()
        {
            CreateTable(
                "dbo.Budgets",
                c => new
                    {
                        UniqueId = c.String(nullable: false, maxLength: 128),
                        StartDay = c.Int(nullable: false),
                        Amount = c.Double(nullable: false),
                        CreatedDate = c.DateTime(nullable: false),
                    })
                .PrimaryKey(t => t.UniqueId);
            
            CreateTable(
                "dbo.Expenses",
                c => new
                    {
                        Id = c.Long(nullable: false, identity: true),
                        Date = c.DateTime(nullable: false),
                        Description = c.String(),
                        Amount = c.Double(nullable: false),
                        DateCreated = c.DateTime(nullable: false),
                        Budget_UniqueId = c.String(maxLength: 128),
                    })
                .PrimaryKey(t => t.Id)
                .ForeignKey("dbo.Budgets", t => t.Budget_UniqueId)
                .Index(t => t.Budget_UniqueId);
            
        }
        
        public override void Down()
        {
            DropForeignKey("dbo.Expenses", "Budget_UniqueId", "dbo.Budgets");
            DropIndex("dbo.Expenses", new[] { "Budget_UniqueId" });
            DropTable("dbo.Expenses");
            DropTable("dbo.Budgets");
        }
    }
}
