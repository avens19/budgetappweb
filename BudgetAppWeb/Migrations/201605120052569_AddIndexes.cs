namespace BudgetAppWeb.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class AddIndexes : DbMigration
    {
        public override void Up()
        {
            Sql("UPDATE dbo.Expenses SET Description = '' WHERE Description IS NULL");
            AlterColumn("dbo.Categories", "Name", c => c.String(nullable: false, maxLength: 255, unicode: false));
            AlterColumn("dbo.Expenses", "Description", c => c.String(nullable: false, maxLength: 255, unicode: false));
            CreateIndex("dbo.Categories", "Name");
            CreateIndex("dbo.Expenses", "Description");
        }
        
        public override void Down()
        {
            DropIndex("dbo.Expenses", new[] { "Description" });
            DropIndex("dbo.Categories", new[] { "Name" });
            AlterColumn("dbo.Expenses", "Description", c => c.String());
            AlterColumn("dbo.Categories", "Name", c => c.String(nullable: false));
        }
    }
}
